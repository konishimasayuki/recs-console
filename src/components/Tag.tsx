import type { Badge } from "@/lib/view";

export default function Tag({ b }: { b: Badge }) {
  return <span className={`tag ${b.tone}`}>{b.text}</span>;
}
