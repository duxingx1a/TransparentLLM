// 静态导出：返回一个占位 id 满足 generateStaticParams 要求，实际数据由客户端动态获取
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function LogDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
