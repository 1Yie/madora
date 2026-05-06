import { createHashRouter } from "react-router-dom";
import { MainLayout } from "../layout/index";

// 使用 createHashRouter 适配桌面端本地协议
const router = createHashRouter([
  {
    path: "/",
    element: <MainLayout />,

  },
]);

export default router;