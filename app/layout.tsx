import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "红鞋烘焙 · 蛋糕灵感库",
  description: "从 1757 款真实蛋糕中，按对象、场合、预算和风格智能挑选。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
