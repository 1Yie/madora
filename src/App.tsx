import { RouterProvider } from "react-router-dom";
import router from "./router";
import Titlebar from "./components/system/top-bar";


function App() {
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
