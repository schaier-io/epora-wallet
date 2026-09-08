import { vi } from "vitest";

vi.mock("@/components/user/workspace/queries/stt-queries.atoms", () => import("./workspace-query-fixtures"));
vi.mock("@/components/user/workspace/queries/locked-utxos.atoms", () => import("./workspace-query-fixtures"));
vi.mock("@/components/user/workspace/queries/summary-queries.atoms", () => import("./workspace-query-fixtures"));
vi.mock("@/components/user/workspace/queries/shared-reference.atoms", () => import("./workspace-query-fixtures"));
