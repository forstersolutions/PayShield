type PayShieldMarkProps = {
  className?: string;
};

export function PayShieldMark({ className = "size-11" }: PayShieldMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="18" fill="#05070A" />
      <path
        d="M22 51V15h17c8.2 0 13.5 5.2 13.5 13S47.2 41 39 41h-8"
        stroke="#7CF8D4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7.2"
      />
      <path
        d="M31 41v8.2L39.5 54 48 49.2"
        stroke="#FFD166"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7.2"
      />
      <path
        d="M31.5 27.8H39"
        stroke="#E7FFF7"
        strokeLinecap="round"
        strokeWidth="5"
      />
    </svg>
  );
}
