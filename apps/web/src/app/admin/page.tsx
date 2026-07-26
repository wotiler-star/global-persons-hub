import { redirect } from 'next/navigation';

// 兼容旧链接 / 根作用域跳转：统一到中文版 [lang] 路由
export default function AdminRedirect() {
  redirect('/zh/admin');
}
