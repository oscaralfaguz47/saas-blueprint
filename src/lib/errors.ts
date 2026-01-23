export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  }

  return "Unknown error";
}

export function toErrorMessage(err: unknown): string {
  if (!err) return "";

  if (typeof err === "string") return err;

  if (err instanceof Error) return err.message;

  // Prisma / NextAuth / random objects sometimes come like this
  if (typeof err === "object") {
    const anyErr = err as { message?: unknown; error?: unknown; code?: unknown };

    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error === "string") return anyErr.error;
    if (typeof anyErr.code === "string") return anyErr.code;

    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown error";
    }
  }

  return "Unknown error";
}