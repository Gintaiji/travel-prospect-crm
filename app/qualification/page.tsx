import { redirect } from "next/navigation";

export default function QualificationPage() {
  redirect("/prospects?mode=qualification");
}
