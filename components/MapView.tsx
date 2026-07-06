"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { PolygonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { FlyToInterpolator, type MapViewState, type PickingInfo } from "@deck.gl/core";
import { Map } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Block, heatColor, scoreFromLST } from "@/lib/model";
import type { FlyTarget } from "./BottomSheet";

// Dark basemap WITH labels so streets and locality names are visible
const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const INITIAL_VIEW: MapViewState = {
  longitude: 77.058,
  latitude: 28.462,
  zoom: 11.8,
  pitch: 0,     // flat overhead — fully browsable like a regular map
  bearing: 0,
};

const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

type UserLocation = { longitude: number; latitude: number } | null;

type Props = {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (block: Block | null) => void;
  flyToTarget: FlyTarget | null;
};

export default function MapView({ blocks, selectedId, onSelect, flyToTarget }: Props) {
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW);
  const [hovered, setHovered] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation>(null);
  const [locError, setLocError] = useState(false);
  const locWatchId = useRef<number | null>(null);

  // ── Current location ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    locWatchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({
          longitude: pos.coords.longitude,
          latitude: pos.coords.latitude,
        });
        setLocError(false);
      },
      () => setLocError(true),
      { enableHighAccuracy: true, timeout: 10000 },
    );
    return () => {
      if (locWatchId.current !== null)
        navigator.geolocation.clearWatch(locWatchId.current);
    };
  }, []);

  const flyToLocation = useCallback((lng: number, lat: number, zoom = 13.5) => {
    setViewState((v) => ({
      ...v,
      longitude: lng,
      latitude: lat,
      zoom,
      transitionDuration: 900,
      transitionInterpolator: new FlyToInterpolator({ curve: 1.4 }),
      transitionEasing: easeOutQuint,
    }));
  }, []);

  const handleMyLocation = useCallback(() => {
    if (userLocation) flyToLocation(userLocation.longitude, userLocation.latitude, 14);
    else if (!locError) navigator.geolocation.getCurrentPosition(
      (pos) => flyToLocation(pos.coords.longitude, pos.coords.latitude, 14),
    );
  }, [userLocation, locError, flyToLocation]);

  // ── Fly to selected block ─────────────────────────────────────────────────
  useEffect(() => {
    const block = blocks.find((b) => b.id === selectedId);
    if (block) flyToLocation(block.center[0], block.center[1], 13.8);
  }, [selectedId, blocks, flyToLocation]);

  // ── Fly to geocoded location from sidebar search ──────────────────────────
  useEffect(() => {
    if (!flyToTarget) return;
    flyToLocation(flyToTarget.lng, flyToTarget.lat, flyToTarget.zoom ?? 14);
  }, [flyToTarget, flyToLocation]);

  // ── Hex polygon layer (flat, no extrusion) ────────────────────────────────
  const hexLayer = useMemo(
    () =>
      new PolygonLayer<Block>({
        id: "heat-hexes",
        data: blocks,
        getPolygon: (b) => b.polygon,
        extruded: false,
        getFillColor: (b) => {
          const c = heatColor(scoreFromLST(b.lst));
          const alpha =
            selectedId
              ? b.id === selectedId
                ? 230
                : b.id === hovered
                  ? 180
                  : 130
              : b.id === hovered
                ? 190
                : 150;
          return [c[0], c[1], c[2], alpha];
        },
        getLineColor: (b) =>
          b.id === selectedId ? [255, 255, 255, 240] : [255, 255, 255, 40],
        getLineWidth: (b) => (b.id === selectedId ? 28 : 6),
        lineWidthUnits: "meters",
        stroked: true,
        pickable: true,
        updateTriggers: {
          getFillColor: [selectedId, hovered],
          getLineColor: [selectedId],
          getLineWidth: [selectedId],
        },
        transitions: {
          getFillColor: { duration: 400, easing: easeOutQuint },
        },
        onHover: (info: PickingInfo<Block>) => setHovered(info.object?.id ?? null),
        onClick: (info: PickingInfo<Block>) => onSelect(info.object ?? null),
      }),
    [blocks, selectedId, hovered, onSelect],
  );

  // ── User location dot (pulsing blue) ─────────────────────────────────────
  const [pulse, setPulse] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setPulse((p) => (p === 1 ? 1.5 : 1)), 900);
    return () => clearInterval(id);
  }, []);

  const locationLayer = useMemo(() => {
    if (!userLocation) return null;
    return new ScatterplotLayer({
      id: "user-location",
      data: [userLocation],
      getPosition: (d: UserLocation & object) => [
        (d as { longitude: number; latitude: number }).longitude,
        (d as { longitude: number; latitude: number }).latitude,
      ],
      getRadius: 18 * pulse,
      getFillColor: [59, 130, 246, Math.round(200 / pulse)],
      getLineColor: [255, 255, 255, 220],
      lineWidthMinPixels: 2,
      stroked: true,
      radiusUnits: "meters",
      updateTriggers: { getRadius: [pulse], getFillColor: [pulse] },
    });
  }, [userLocation, pulse]);

  const layers = useMemo(
    () => [hexLayer, ...(locationLayer ? [locationLayer] : [])],
    [hexLayer, locationLayer],
  );

  return (
    <div className="absolute inset-0">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: v }) => setViewState(v as MapViewState)}
        controller={{ doubleClickZoom: false, touchRotate: false }}
        layers={layers}
        getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
        style={{ position: "absolute", inset: "0" }}
      >
        <Map mapStyle={BASEMAP} attributionControl={false} />
      </DeckGL>

      {/* My Location button */}
      <button
        onClick={handleMyLocation}
        title="My location"
        className="my-location-btn"
        style={{
          position: "absolute",
          right: 16,
          bottom: 100,
          zIndex: 15,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(13,15,28,0.88)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
          transition: "background 0.2s",
          color: userLocation ? "#3b82f6" : "rgba(255,255,255,0.6)",
          fontSize: 20,
        }}
        aria-label="Center map on my location"
      >
        ◎
      </button>
    </div>
  );
}

export { INITIAL_VIEW };
