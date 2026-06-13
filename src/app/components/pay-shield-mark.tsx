import Image from "next/image";

type BrandImageProps = {
  className?: string;
  priority?: boolean;
};

export function PayShieldMark({
  className = "size-11",
  priority = false,
}: BrandImageProps) {
  return (
    <span
      aria-hidden="true"
      className={`relative block shrink-0 overflow-visible ${className}`}
    >
      <Image
        alt=""
        className="h-full w-full object-contain drop-shadow-[0_0_18px_rgba(29,135,255,0.36)]"
        height={512}
        priority={priority}
        src="/images/payshield-mark.png"
        width={512}
      />
    </span>
  );
}

export function PayShieldLogo({
  className = "h-12 w-auto",
  priority = false,
}: BrandImageProps) {
  return (
    <Image
      alt="PayShield"
      className={`object-contain ${className}`}
      height={306}
      priority={priority}
      src="/images/payshield-logo-clean.png"
      width={855}
    />
  );
}

export function PayShieldHeaderLogo({
  className = "",
  priority = false,
}: BrandImageProps) {
  return (
    <span className={`pay-brand-lockup ${className}`}>
      <PayShieldMark className="pay-brand-lockup-mark" priority={priority} />
      <span className="pay-brand-lockup-word" aria-label="PayShield">
        <span className="pay-brand-lockup-pay">Pay</span>
        <span>Shield</span>
      </span>
    </span>
  );
}

export function GraystonMark({
  className = "size-9",
  priority = false,
}: BrandImageProps) {
  return (
    <span aria-hidden="true" className={`relative block shrink-0 ${className}`}>
      <Image
        alt=""
        className="h-full w-full object-contain drop-shadow-[0_0_20px_rgba(43,227,255,0.24)]"
        height={256}
        priority={priority}
        src="/images/grayston-emblem.png"
        width={256}
      />
    </span>
  );
}

export function GraystonLogo({
  className = "h-10 w-auto",
  priority = false,
}: BrandImageProps) {
  return (
    <Image
      alt="Grayston Technologies"
      className={`object-contain ${className}`}
      height={201}
      priority={priority}
      src="/images/grayston-logo-full.png"
      width={720}
    />
  );
}
