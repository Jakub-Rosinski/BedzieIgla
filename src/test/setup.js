import "@testing-library/jest-dom";
import { beforeEach } from "vitest";

// Czyść localStorage i sessionStorage przed każdym testem
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
