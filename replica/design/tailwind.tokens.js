// Généré par build_tokens.py. Usage : theme: { extend: require('./tailwind.tokens') }
// → classes bg-surface, text-text-muted, rounded-md, shadow-pop... jamais de hex en dur.
module.exports = {
  "colors": {
    "bg": "var(--color-bg)",
    "surface": "var(--color-surface)",
    "surface-2": "var(--color-surface-2)",
    "border": "var(--color-border)",
    "border-input": "var(--color-border-input)",
    "text": "var(--color-text)",
    "text-muted": "var(--color-text-muted)",
    "accent": "var(--color-accent)",
    "accent-hover": "var(--color-accent-hover)",
    "on-accent": "var(--color-on-accent)",
    "focus": "var(--color-focus)",
    "danger": "var(--color-danger)",
    "on-danger": "var(--color-on-danger)",
    "success": "var(--color-success)",
    "warning": "var(--color-warning)",
    "info": "var(--color-info)",
    "code-bg": "var(--color-code-bg)"
  },
  "fontFamily": {
    "display": [
      "var(--font-display)"
    ],
    "sans": [
      "var(--font-sans)"
    ],
    "mono": [
      "var(--font-mono)"
    ]
  },
  "fontSize": {
    "xs": [
      "var(--text-xs)",
      {
        "lineHeight": "var(--leading-xs)",
        "fontWeight": "var(--weight-xs)"
      }
    ],
    "sm": [
      "var(--text-sm)",
      {
        "lineHeight": "var(--leading-sm)",
        "fontWeight": "var(--weight-sm)"
      }
    ],
    "base": [
      "var(--text-base)",
      {
        "lineHeight": "var(--leading-base)",
        "fontWeight": "var(--weight-base)"
      }
    ],
    "lg": [
      "var(--text-lg)",
      {
        "lineHeight": "var(--leading-lg)",
        "fontWeight": "var(--weight-lg)"
      }
    ],
    "xl": [
      "var(--text-xl)",
      {
        "lineHeight": "var(--leading-xl)",
        "fontWeight": "var(--weight-xl)"
      }
    ],
    "display": [
      "var(--text-display)",
      {
        "lineHeight": "var(--leading-display)",
        "fontWeight": "var(--weight-display)"
      }
    ]
  },
  "spacing": {
    "0": "var(--space-0)",
    "1": "var(--space-1)",
    "2": "var(--space-2)",
    "3": "var(--space-3)",
    "4": "var(--space-4)",
    "5": "var(--space-5)",
    "6": "var(--space-6)",
    "7": "var(--space-7)",
    "8": "var(--space-8)",
    "9": "var(--space-9)"
  },
  "borderRadius": {
    "sm": "var(--radius-sm)",
    "md": "var(--radius-md)",
    "lg": "var(--radius-lg)",
    "pill": "var(--radius-pill)"
  },
  "boxShadow": {
    "card": "var(--shadow-card)",
    "pop": "var(--shadow-pop)",
    "glow": "var(--shadow-glow)"
  },
  "screens": {
    "sm": "640px",
    "md": "768px",
    "lg": "1024px",
    "xl": "1280px"
  }
};
