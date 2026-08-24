import { redirect } from "next/navigation";

export default function HomePage(): never {
  // The room step arrives in a later milestone; until then the configurator opens on the scene.
  redirect("/configurator/configure");
}
