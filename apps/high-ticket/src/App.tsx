import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { ProfilePage } from "./pages/ProfilePage";
import { CoachPage } from "./pages/CoachPage";
import { ToolsPage } from "./pages/ToolsPage";
import { AppStateProvider, useAppState } from "./state";
import { AuthProvider } from "./auth";
import { AccountPage } from "./pages/AccountPage";
import { ShopPage } from "./pages/ShopPage";
import { NotebookPage } from "./pages/NotebookPage";

function RequireProfile({ children }: { children: JSX.Element }) {
  const { profile } = useAppState();
  return profile ? children : <Navigate to="/profil" replace />;
}

export function App() {
  return (
    <AuthProvider>
      <AppStateProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/profil" element={<ProfilePage />} />
              <Route
                path="/parcours"
                element={
                  <RequireProfile>
                    <CoachPage />
                  </RequireProfile>
                }
              />
              <Route path="/outils" element={<ToolsPage />} />
              <Route path="/carnet" element={<NotebookPage />} />
              <Route path="/boutique" element={<ShopPage />} />
              <Route path="/compte" element={<AccountPage />} />
              <Route path="/outils/:toolId" element={<ToolsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppStateProvider>
    </AuthProvider>
  );
}
