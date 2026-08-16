import { FormEvent, useState } from "react";

interface Props {
  title: string;
  onSubmit: (vendorId: string) => void;
}

export function VendorSetup({ title, onSubmit }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
    }
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <h1>{title}</h1>
        <p>
          Entrez le code de votre établissement pour configurer cet appareil.
          Cette étape n'est nécessaire qu'une seule fois par appareil.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            autoFocus
            type="text"
            placeholder="ex. cocorico"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Valider
          </button>
        </form>
      </div>
    </div>
  );
}
