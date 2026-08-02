import useSWR from "swr";
import { swrFetcher, type ApiError } from "./api";

export interface MeResponse {
  authenticated: boolean;
  email: string;
}

export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<MeResponse, ApiError>(
    "/api/me",
    swrFetcher,
    { shouldRetryOnError: false },
  );
  return {
    email: data?.email ?? null,
    authenticated: Boolean(data?.authenticated),
    isLoading,
    error,
    mutate,
  };
}
