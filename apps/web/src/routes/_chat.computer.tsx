import { createFileRoute } from "@tanstack/react-router";

import { NasirComputerPage } from "../components/nasir/NasirComputerPage";

export const Route = createFileRoute("/_chat/computer")({
  component: NasirComputerPage,
});
