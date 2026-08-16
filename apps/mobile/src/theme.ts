// Palette et tailles pensées pour une lecture en plein soleil et un usage
// rapide dans un environnement de festival bruyant : fort contraste,
// grosses zones tactiles, peu de texte.
export const theme = {
  colors: {
    background: "#fdf6ec",
    surface: "#ffffff",
    text: "#241a12",
    textMuted: "#6b5c4c",
    primary: "#e0521b",
    primaryDark: "#b8410f",
    secondary: "#2f7a52",
    border: "#e8dcc9",
    danger: "#c23b22",
    warning: "#d98a1b",
    waiting: "#9a8b78",
    preparing: "#d98a1b",
    ready: "#2f7a52",
  },
  spacing: (n: number) => n * 8,
  radius: 16,
};
