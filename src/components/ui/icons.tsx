import React from "react";

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

function BaseIcon({
  size = 18,
  children,
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05a2.2 2.2 0 0 1-1.56 3.75 2.2 2.2 0 0 1-1.56-.64l-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.64V21a2.2 2.2 0 0 1-4.4 0v-.1a1.8 1.8 0 0 0-1.08-1.64 1.8 1.8 0 0 0-1.98.36l-.05.05a2.2 2.2 0 0 1-3.12 0 2.2 2.2 0 0 1 0-3.12l.05-.05A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.64-1.08H2.9a2.2 2.2 0 0 1 0-4.4h.06A1.8 1.8 0 0 0 4.6 8.44a1.8 1.8 0 0 0-.36-1.98l-.05-.05a2.2 2.2 0 0 1 3.12-3.12l.05.05A1.8 1.8 0 0 0 9.34 3a1.8 1.8 0 0 0 1.08-1.64V1.3a2.2 2.2 0 0 1 4.4 0v.06A1.8 1.8 0 0 0 15.9 3a1.8 1.8 0 0 0 1.98-.36l.05-.05a2.2 2.2 0 0 1 3.12 3.12l-.05.05A1.8 1.8 0 0 0 19.4 8.44a1.8 1.8 0 0 0 1.64 1.08h.06a2.2 2.2 0 0 1 0 4.4h-.06A1.8 1.8 0 0 0 19.4 15z" />
    </BaseIcon>
  );
}

export function IconBilling(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 7h10" />
      <path d="M7 11h10" />
      <path d="M7 15h6" />
      <path d="M6 3h12a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2z" />
    </BaseIcon>
  );
}

export function IconWorkspace(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 20V8a2 2 0 0 1 2-2h7" />
      <path d="M8 6V4a2 2 0 0 1 2-2h10v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2" />
      <path d="M12 10h6" />
      <path d="M12 14h6" />
    </BaseIcon>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M10 17l-1 0a4 4 0 0 1-4-4V11a4 4 0 0 1 4-4h1" />
      <path d="M15 7l5 5-5 5" />
      <path d="M20 12H10" />
    </BaseIcon>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </BaseIcon>
  );
}

export function IconX(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </BaseIcon>
  );
}
