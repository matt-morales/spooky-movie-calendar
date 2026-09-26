import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import type { Analytics } from "../lib/analytics";
import type { CommentClient } from "@spooky/comment";
import type { Api } from "../lib/api";
import { loadWatched, saveWatched } from "../lib/watched";
import type { AppEvent } from "./events";
import { createInitialState, reducer, type AppState } from "./reducer";

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<AppEvent> | null>(null);
const ServicesContext = createContext<Services | null>(null);

export interface Services {
  api: Api;
  analytics: Analytics;
  comments: CommentClient;
}

export function AppStateProvider({ services, children }: { services: Services; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, () => createInitialState(window.location.hash, loadWatched()));
  useEffect(() => saveWatched(state.watched), [state.watched]);
  return (
    <ServicesContext.Provider value={services}>
      <DispatchContext.Provider value={dispatch}>
        <StateContext.Provider value={state}>{children}</StateContext.Provider>
      </DispatchContext.Provider>
    </ServicesContext.Provider>
  );
}

function required<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`${name} used outside AppStateProvider`);
  return value;
}

export const useAppState = () => required(useContext(StateContext), "useAppState");
export const useDispatch = () => required(useContext(DispatchContext), "useDispatch");
export const useServices = () => required(useContext(ServicesContext), "useServices");
