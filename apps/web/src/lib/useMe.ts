import useSWR from "swr";
import { swrFetcher, type ApiError } from "./api";

export interface MeResponse {
  authenticated: boolean;
  email: string;
  name: string | null;
  avatar: string | null;
}

export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<MeResponse, ApiError>(
    "/api/me",
    swrFetcher,
    { shouldRetryOnError: false },
  );
  return {
    email: data?.email ?? null,
    name: data?.name ?? null,
    avatar: data?.avatar ?? null,
    authenticated: Boolean(data?.authenticated),
    isLoading,
    error,
    mutate,
  };
}
