type PortalSignInRequiredProps = {
  portal: "Bowler" | "Team Captain";
};

export default function PortalSignInRequired({ portal }: PortalSignInRequiredProps) {
  return (
    <div className="min-h-screen bg-[#0d0d0d] px-6 text-white flex items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-amber-400/30 bg-[#151515] p-6 text-center shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Secure access</p>
        <h1 className="mt-3 text-2xl font-black">{portal} sign-in required</h1>
        <p className="mt-3 text-sm leading-6 text-gray-300">
          You must sign in before viewing this portal. Taking you to the sign-in page now.
        </p>
      </div>
    </div>
  );
}
