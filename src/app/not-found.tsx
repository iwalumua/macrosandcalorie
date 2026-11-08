import Link from "next/link";
import { btnPrimary, card } from "./_components/styles";

export default function NotFound() {
  return (
    <div className={`${card} mt-6 text-center`}>
      <h1 className="text-xl font-bold">Not found</h1>
      <p className="mt-1 text-sm text-muted">That page or food does not exist, or it is not yours.</p>
      <Link href="/diary" className={`${btnPrimary} mt-4`}>
        Back to the diary
      </Link>
    </div>
  );
}
