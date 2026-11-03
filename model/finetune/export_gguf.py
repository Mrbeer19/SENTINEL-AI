"""Merge a SENTINEL LoRA adapter into Qwen3.5-4B and import it into Ollama.

Run (D:\\ai-env, after training; needs ~10 GB free RAM):
  python model/finetune/export_gguf.py --base D:\\ai-models\\Qwen3.5-4B --adapter D:\\ai-models\\sentinel-lora-r1 \
      --work D:\\ai-models\\sentinel-r1 --llama-cpp D:\\ai-models\\llama.cpp --name sentinel-qwen3.5-4b-r1

Steps: merge on CPU (bf16) -> convert_hf_to_gguf.py (f16) -> `ollama create -q q4_K_M` with the same
renderer/parser as qwen3.5:4b, so tool calls and the chat format match the base model exactly.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

MODELFILE = """FROM {gguf}
TEMPLATE {{{{ .Prompt }}}}
RENDERER qwen3.5
PARSER qwen3.5
PARAMETER presence_penalty 1.5
PARAMETER temperature 1
PARAMETER top_k 20
PARAMETER top_p 0.95
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--adapter", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--llama-cpp", required=True)
    ap.add_argument("--name", required=True)
    args = ap.parse_args()
    work = Path(args.work)
    merged, gguf = work / "merged", work / "model-f16.gguf"
    work.mkdir(parents=True, exist_ok=True)

    if not (merged / "config.json").exists():
        model = AutoModelForCausalLM.from_pretrained(args.base, dtype=torch.bfloat16, low_cpu_mem_usage=True, device_map={"": "cpu"})
        model = PeftModel.from_pretrained(model, args.adapter).merge_and_unload()
        model.save_pretrained(merged, safe_serialization=True, max_shard_size="2GB")
        AutoTokenizer.from_pretrained(args.base).save_pretrained(merged)
        del model
        print("merged ->", merged, flush=True)

    if not gguf.exists():
        subprocess.run([sys.executable, str(Path(args.llama_cpp) / "convert_hf_to_gguf.py"), str(merged), "--outfile", str(gguf), "--outtype", "f16"], check=True)
        print("gguf ->", gguf, flush=True)

    (work / "Modelfile").write_text(MODELFILE.format(gguf=gguf.resolve()), encoding="utf-8")
    subprocess.run(["ollama", "create", args.name, "-q", "q4_K_M", "-f", str(work / "Modelfile")], check=True)
    print("ollama model:", args.name)


if __name__ == "__main__":
    main()
