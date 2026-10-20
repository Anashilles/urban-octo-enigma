import type * as THREE from "three";

/**
 * Name tags are plain DOM elements in one overlay layer; a small component
 * inside the canvas projects each avatar's head position to the screen every
 * frame and moves its tag. Cheaper and more robust than one React root per tag.
 */
export const tagElements = new Map<string, HTMLElement>();
export const avatarAnchors = new Map<string, THREE.Object3D>();
