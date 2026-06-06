type PayShieldMarkProps = {
  className?: string;
};

export function PayShieldMark({ className = "size-11" }: PayShieldMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="16" fill="#0B0A08" />
      <path
        d="M14 32h17"
        fill="none"
        stroke="#F5EFE4"
        strokeLinecap="round"
        strokeWidth="7"
      />
      <path
        d="M31 32c8 0 8.8-10.5 18-13"
        fill="none"
        stroke="#7EE0A3"
        strokeLinecap="round"
        strokeWidth="7"
      />
      <path
        d="M31 32c8 0 8.8 10.5 18 13"
        fill="none"
        stroke="#D89B57"
        strokeLinecap="round"
        strokeWidth="7"
      />
      <circle cx="14" cy="32" r="4.2" fill="#F5EFE4" />
      <circle cx="31" cy="32" r="4.8" fill="#0B0A08" />
      <circle cx="49" cy="19" r="5" fill="#7EE0A3" />
      <circle cx="49" cy="45" r="5" fill="#D89B57" />
    </svg>
  );
}
