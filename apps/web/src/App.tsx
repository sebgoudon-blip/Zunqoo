import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { CashierPage } from "./pages/CashierPage";
import { DisplayPage } from "./pages/DisplayPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/caisse" element={<CashierPage />} />
        <Route path="/display" element={<DisplayPage />} />
      </Routes>
    </BrowserRouter>
  );
}
