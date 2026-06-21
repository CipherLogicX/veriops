import type { ReactNode } from "react";

type ModalProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
};

export default function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div className="tq-modal-backdrop" onMouseDown={onClose}>
      <section
        className="tq-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tq-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="tq-modal-header">
          <div>
            <h2 id="tq-modal-title" className="tq-modal-title">
              {title}
            </h2>
          </div>

          <button
            type="button"
            className="tq-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </header>

        <div className="tq-modal-body">{children}</div>
      </section>
    </div>
  );
}
