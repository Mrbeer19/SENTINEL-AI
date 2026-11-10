import React from "react";
export function ConnectionLoader() {
  return (
    <div className="posterConnect" role="status">
      <span className="connectOrbit" />
      <p>กำลังตรวจสอบเซสชัน…</p>
    </div>
  );
}
export function PageSkeleton() {
  return (
    <div className="pageSkeleton" role="status" aria-label="กำลังโหลดข้อมูล">
      <span className="skeletonStatus">กำลังโหลดข้อมูล…</span>
      <i className="skeleton skeletonHero" />
      <div className="skeletonKpis">
        {[0, 1, 2].map((i) => (
          <i key={i} className="skeleton" />
        ))}
      </div>
      <div className="skeletonMain">
        <i className="skeleton" />
        <div>
          <i className="skeleton" />
          <i className="skeleton" />
        </div>
      </div>
    </div>
  );
}
