import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const secret = body.secret;
  const path = body.path as string | undefined;
  const slug = body.slug as string | undefined;

  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (slug) {
    revalidateTag(`tenant-${slug}`);
  }
  if (path) {
    revalidatePath(path);
  }

  return NextResponse.json({ revalidated: true });
}
