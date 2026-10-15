import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  tripsApi,
  type NewTripInput,
  type Trip,
  type TripHotelInput,
  type TripHotelPatch,
  type TripItemInput,
  type TripItemPatch,
  type TripPatch,
} from "@/lib/api/trips";
import { queryKeys } from "@/lib/query-client.ts";
import { errorMessage } from "@/lib/errors";

export function useTripsList() {
  return useQuery({ queryKey: queryKeys.trips.list(), queryFn: () => tripsApi.list() });
}

export function useTrip(id: string) {
  return useQuery({ queryKey: queryKeys.trips.detail(id), queryFn: () => tripsApi.get(id) });
}

export function useCreateTrip() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTripInput) => tripsApi.create(input),
    onSuccess: (trip) => {
      client.setQueryData(queryKeys.trips.detail(trip.id), trip);
      void client.invalidateQueries({ queryKey: queryKeys.trips.list() });
    },
    onError: (err) => toast.error(errorMessage(err, "Could not create that trip.")),
  });
}

/**
 * Board mutations for one trip. Every write returns the whole updated trip,
 * which replaces the cached copy — no refetch round trip.
 */
export function useTripActions(tripId: string) {
  const client = useQueryClient();
  const apply = (trip: Trip) => {
    client.setQueryData(queryKeys.trips.detail(trip.id), trip);
    void client.invalidateQueries({ queryKey: queryKeys.trips.list() });
  };
  const fail = (fallback: string) => (err: unknown) => toast.error(errorMessage(err, fallback));

  const update = useMutation({
    mutationFn: (patch: TripPatch) => tripsApi.update(tripId, patch),
    onSuccess: apply,
    onError: fail("Could not update the trip."),
  });

  const remove = useMutation({
    mutationFn: () => tripsApi.remove(tripId),
    onSuccess: () => {
      toast.success("Trip deleted");
      client.removeQueries({ queryKey: queryKeys.trips.detail(tripId) });
      void client.invalidateQueries({ queryKey: queryKeys.trips.list() });
    },
    onError: fail("Could not delete the trip."),
  });

  const addHotel = useMutation({
    mutationFn: (input: TripHotelInput) => tripsApi.addHotel(tripId, input),
    onSuccess: apply,
    onError: fail("Could not add that hotel."),
  });

  const updateHotel = useMutation({
    mutationFn: ({ hotelId, patch }: { hotelId: string; patch: TripHotelPatch }) =>
      tripsApi.updateHotel(tripId, hotelId, patch),
    onSuccess: apply,
    onError: fail("Could not update that hotel."),
  });

  const removeHotel = useMutation({
    mutationFn: (hotelId: string) => tripsApi.removeHotel(tripId, hotelId),
    onSuccess: apply,
    onError: fail("Could not remove that hotel."),
  });

  const addItem = useMutation({
    mutationFn: (input: TripItemInput) => tripsApi.addItem(tripId, input),
    onSuccess: apply,
    onError: fail("Could not add that plan."),
  });

  const updateItem = useMutation({
    mutationFn: ({ itemId, patch }: { itemId: string; patch: TripItemPatch }) =>
      tripsApi.updateItem(tripId, itemId, patch),
    onSuccess: apply,
    onError: fail("Could not update that plan."),
  });

  const moveItem = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: string; direction: "up" | "down" }) =>
      tripsApi.moveItem(tripId, itemId, direction),
    onSuccess: apply,
    onError: fail("Could not move that plan."),
  });

  const locate = useMutation({
    mutationFn: (skip: string[]) => tripsApi.locate(tripId, skip),
    onSuccess: (res) => apply(res.trip),
    onError: fail("Could not pin places on the map."),
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => tripsApi.removeItem(tripId, itemId),
    onSuccess: apply,
    onError: fail("Could not remove that plan."),
  });

  return {
    update,
    remove,
    addHotel,
    updateHotel,
    removeHotel,
    addItem,
    updateItem,
    moveItem,
    locate,
    removeItem,
  };
}
