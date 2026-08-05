interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Address lookup is the only feature that sends data off the device, so it is
 * confirmed once explicitly — from the settings sheet as well as from the
 * shortcut in the top bar.
 */
export default function AddressConsentDialog({ open, onCancel, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <div className="w-full max-w-sm rounded-xl bg-panel p-5">
        <h3 className="mb-2 text-base font-semibold">Adresse online auflösen?</h3>
        <p className="mb-4 text-sm text-slate-300">
          Dafür werden deine Koordinaten an den Dienst Nominatim von OpenStreetMap gesendet. Alles
          andere in dieser App bleibt auf dem Gerät. Die Abfrage erfolgt gedrosselt und nur nach einer
          Ortsveränderung von mehr als 50 Metern.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="chip" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" className="chip chip-active" onClick={onConfirm}>
            Einverstanden
          </button>
        </div>
      </div>
    </div>
  );
}
