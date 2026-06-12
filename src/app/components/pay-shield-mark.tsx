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
      <rect width="64" height="64" rx="16" fill="#0F1714" />
      <path
        d="M32 7.5 51 15v13.7c0 12.1-7.2 21.9-19 27.8-11.8-5.9-19-15.7-19-27.8V15l19-7.5Z"
        fill="#BEECCB"
      />
      <path
        d="M32 14.3 44.8 19v9.1c0 8.2-4.5 14.8-12.8 19.5-8.3-4.7-12.8-11.3-12.8-19.5V19L32 14.3Z"
        fill="#12271D"
      />
      <path
        d="M25 24.5h15.5c2.2 0 4 1.8 4 4s-1.8 4-4 4H31.6c-2.2 0-4 1.8-4 4s1.8 4 4 4H43"
        fill="none"
        stroke="#F7F1E7"
        strokeLinecap="round"
        strokeWidth="5.5"
      />
      <path
        d="M22.5 24.5h6.7v16h-6.7z"
        fill="#F2BC7D"
      />
      <path
        d="M22.5 32.2h20.7"
        fill="none"
        stroke="#BEECCB"
        strokeLinecap="round"
        strokeWidth="3.4"
      />
    </svg>
  );
}

export function GraystonMark({ className = "size-9" }: PayShieldMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="16" fill="#111827" />
      <path
        d="M32 9 51.9 20.5v23L32 55 12.1 43.5v-23L32 9Z"
        fill="#D7E2EF"
      />
      <path
        d="M32 15.4 46.4 23.7v16.6L32 48.6l-14.4-8.3V23.7L32 15.4Z"
        fill="#111827"
      />
      <path
        d="M39.9 27.1c-1.6-2.3-4.2-3.6-7.4-3.6-5 0-8.8 3.7-8.8 8.6s3.8 8.5 8.8 8.5c3.8 0 6.7-1.9 7.9-5.1h-8.1v-5.2h14.3v3.2c0 7.3-5.7 12.8-14.1 12.8-8.5 0-15.1-6.1-15.1-14.2s6.6-14.3 15.1-14.3c5.7 0 10.4 2.7 12.9 7.1l-5.5 2.2Z"
        fill="#D7E2EF"
      />
      <circle cx="45.6" cy="18.4" r="3.8" fill="#8FD6B1" />
    </svg>
  );
}
