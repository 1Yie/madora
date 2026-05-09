import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import router from "./router";
import Titlebar from "./components/system/top-bar";

function App() {
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Titlebar />
      <div className="min-h-0 flex-1">
        <RouterProvider router={router} />
      </div>
    </div>
  );
}

export default App;
