"""QLoRA fine-tune of Qwen3.5-4B for the 3 SENTINEL agents (RTX 4060 8 GB).

Run (D:\\ai-env):  python model/finetune/train_qlora.py --base D:\\ai-models\\Qwen3.5-4B --out D:\\ai-models\\sentinel-lora-r1

Loss is computed on the agents' own turns only (tool calls, summary, JSON), never on the
system prompt, the incident or tool results. Samples longer than --max-len are dropped, not cut,
so a target is never truncated.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, Trainer, TrainingArguments

DATA = Path(__file__).with_name("data")
TARGETS = ["q_proj", "k_proj", "v_proj", "o_proj", "in_proj_qkv", "in_proj_z", "out_proj", "gate_proj", "up_proj", "down_proj"]


def render(tok, messages, tools, **kw):
    return tok.apply_chat_template(messages, tools=tools or None, tokenize=False, enable_thinking=False, **kw)


def encode(tok, row: dict, max_len: int):
    """Token ids + labels where only assistant turns are learned. None if too long or the template is not prefix-stable."""
    tools = [{"type": "function", "function": t} for t in row.get("tools", [])]
    msgs = row["messages"]
    full = tok(render(tok, msgs, tools), add_special_tokens=False).input_ids
    if len(full) > max_len:
        return None
    labels = [-100] * len(full)
    for i, m in enumerate(msgs):
        if m["role"] != "assistant":
            continue
        start = len(tok(render(tok, msgs[:i], tools, add_generation_prompt=True), add_special_tokens=False).input_ids)
        end = len(tok(render(tok, msgs[: i + 1], tools), add_special_tokens=False).input_ids)
        if full[:start] != tok(render(tok, msgs[:i], tools, add_generation_prompt=True), add_special_tokens=False).input_ids:
            return None
        labels[start:end] = full[start:end]
    return {"input_ids": full, "labels": labels}


def load(tok, name: str, max_len: int):
    rows = [json.loads(line) for line in (DATA / f"sft_{name}.jsonl").open(encoding="utf-8")]
    out, dropped = [], 0
    for r in rows:
        e = encode(tok, r, max_len)
        if e is None:
            dropped += 1
        else:
            out.append(e)
    print(f"{name}: {len(out)} samples, dropped {dropped} (too long or template mismatch)")
    return out


def collate(pad_id: int):
    def fn(batch):
        n = max(len(b["input_ids"]) for b in batch)
        ids = torch.full((len(batch), n), pad_id)
        lab = torch.full((len(batch), n), -100)
        att = torch.zeros((len(batch), n), dtype=torch.long)
        for i, b in enumerate(batch):
            k = len(b["input_ids"])
            ids[i, :k], lab[i, :k], att[i, :k] = torch.tensor(b["input_ids"]), torch.tensor(b["labels"]), 1
        return {"input_ids": ids, "labels": lab, "attention_mask": att}
    return fn


class TargetOnlyTrainer(Trainer):
    """Compute logits only where a label exists: the full-vocabulary logits of a 4k-token sample do not fit in 8 GB."""

    def compute_loss(self, model, inputs, return_outputs=False, num_items_in_batch=None):
        labels = inputs.pop("labels")
        keep = (labels[0, 1:] != -100).nonzero()[:, 0]  # batch size 1: positions whose next token is a target
        out = model(**inputs, logits_to_keep=keep)
        loss = torch.nn.functional.cross_entropy(out.logits[0].float(), labels[0, keep + 1])
        return (loss, out) if return_outputs else loss


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=float, default=3)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--max-len", type=int, default=4096)
    ap.add_argument("--grad-accum", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0, help="smoke test: use only N training samples")
    ap.add_argument("--save-steps", type=int, default=10, help="checkpoint every N steps so an interrupted run can resume")
    ap.add_argument("--resume", action="store_true", help="continue from the latest checkpoint in --out")
    args = ap.parse_args()

    torch.manual_seed(0)
    random.seed(0)
    tok = AutoTokenizer.from_pretrained(args.base)
    train, val = load(tok, "train", args.max_len), load(tok, "val", args.max_len)
    if args.limit:
        train, val = train[: args.limit], val[: max(4, args.limit // 4)]

    model = AutoModelForCausalLM.from_pretrained(
        args.base, dtype=torch.bfloat16, low_cpu_mem_usage=True, device_map={"": 0},
        quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True))
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    model = get_peft_model(model, LoraConfig(r=args.rank, lora_alpha=2 * args.rank, lora_dropout=0.05, target_modules=TARGETS, task_type="CAUSAL_LM"))
    model.print_trainable_parameters()
    print(f"VRAM after load: {torch.cuda.memory_allocated() / 2**30:.2f} GB")

    steps = math.ceil(len(train) / args.grad_accum * args.epochs)
    trainer = TargetOnlyTrainer(
        model=model,
        args=TrainingArguments(
            output_dir=args.out, per_device_train_batch_size=1, per_device_eval_batch_size=1, gradient_accumulation_steps=args.grad_accum,
            num_train_epochs=args.epochs, learning_rate=args.lr, lr_scheduler_type="cosine", warmup_steps=max(1, steps // 20),
            logging_steps=5, eval_strategy="epoch", save_strategy="steps", save_steps=args.save_steps, save_total_limit=2, bf16=True,
            gradient_checkpointing=True, optim="paged_adamw_8bit", report_to=[], dataloader_num_workers=0, remove_unused_columns=False),
        train_dataset=train, eval_dataset=val, data_collator=collate(tok.pad_token_id or tok.eos_token_id))
    trainer.train(resume_from_checkpoint=args.resume and any(Path(args.out).glob("checkpoint-*")))
    model.save_pretrained(args.out)
    tok.save_pretrained(args.out)
    print(f"peak VRAM {torch.cuda.max_memory_allocated() / 2**30:.2f} GB, saved adapter to {args.out}")


if __name__ == "__main__":
    main()
