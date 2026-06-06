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
      <rect width="64" height="64" rx="14" fill="#17130F" />
      <path
        d="M18 12h18.6C45.2 12 51 17.7 51 25.4s-5.8 13.4-14.4 13.4h-7.3V52H18V12Z"
        fill="#FFF4E8"
      />
      <path
        d="M18 12h18.6c6.4 0 11.3 3.1 13.3 8.2H18V12Z"
        fill="#EDB981"
      />
      <path
        d="M29.3 38.8V52h7.3c6.5-2.1 11.3-7.5 12.6-14.3-3.2 0.7-7.2 1.1-12.6 1.1h-7.3Z"
        fill="#B8E7C5"
      />
      <path
        d="M29.3 21.2v8.7h6.6c2.9 0 4.7-1.7 4.7-4.4 0-2.6-1.8-4.3-4.7-4.3h-6.6Z"
        fill="#17130F"
      />
      <path d="M18 48h11.3v4H18z" fill="#B8E7C5" />
    </svg>
  );
}
