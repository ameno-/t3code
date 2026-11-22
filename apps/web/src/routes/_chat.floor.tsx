import { createFileRoute } from "@tanstack/react-router";

import { FloorPage } from "../components/floor/FloorPage";

export const Route = createFileRoute("/_chat/floor")({
  component: FloorPage,
});
