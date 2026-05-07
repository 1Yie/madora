import { createHashRouter } from "react-router-dom";
import { MainLayout } from "../layout/index";

const router = createHashRouter([
  {
    path: "/",
    element: <MainLayout />,

  },
]);

export default router;