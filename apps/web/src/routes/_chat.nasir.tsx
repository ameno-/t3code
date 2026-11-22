import { createFileRoute } from "@tanstack/react-router";

import { NasirHomePage } from "../components/nasir/NasirHomePage";

export const Route = createFileRoute("/_chat/nasir")({
  component: NasirHomePage,
});
