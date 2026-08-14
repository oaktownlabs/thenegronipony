import type { LucideIcon } from 'lucide-react';
import { BookOpen, Boxes, FlaskConical, Github, Image, ScanLine, Wrench } from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
};

export type SiteSection = {
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status: string;
};

export type PlaceholderCard = {
  title: string;
  description: string;
  status: string;
};

export const navItems: NavItem[] = [
  { href: '/', label: 'Overview' },
  { href: '/build-log', label: 'Build Log' },
  { href: '/calibration', label: 'Calibration' },
  { href: '/open-source', label: 'Open Source' },
  { href: '/media', label: 'Media' },
];

export const siteSections: SiteSection[] = [
  {
    title: 'Build Log',
    eyebrow: 'Process',
    description: 'Milestone updates, decision history, fabrication notes, and what went wrong.',
    href: '/build-log',
    icon: BookOpen,
    status: 'Placeholder shell',
  },
  {
    title: 'Calibration',
    eyebrow: 'Lab Notes',
    description: 'Pump tests, fluid-path assumptions, recipe volumes, and calibration data.',
    href: '/calibration',
    icon: FlaskConical,
    status: 'Schema pending',
  },
  {
    title: 'CAD + Fabrication',
    eyebrow: 'Files',
    description: 'Scan files, Nostril Nozzle iterations, sidecar parts, and assembly references.',
    href: '/open-source',
    icon: ScanLine,
    status: 'Awaiting scans',
  },
  {
    title: 'Firmware',
    eyebrow: 'Controls',
    description: 'Pump control, recipe selection, lighting states, and bench-test utilities.',
    href: '/open-source',
    icon: Wrench,
    status: 'V1 planned',
  },
  {
    title: 'BOM',
    eyebrow: 'Materials',
    description: 'Known parts, unknown specs, supplier notes, and safety-sensitive substitutions.',
    href: '/open-source',
    icon: Boxes,
    status: 'Do not guess',
  },
  {
    title: 'Media Bank',
    eyebrow: 'Launch',
    description: 'Hero images, short-form clips, build photos, captions, and release sequence.',
    href: '/media',
    icon: Image,
    status: 'Capture list ready',
  },
];

export const milestonePlaceholders: PlaceholderCard[] = [
  {
    title: 'Milestone 1: Site Skeleton',
    description: 'Static Cloudflare-ready site architecture plus placeholder launch content.',
    status: 'In progress',
  },
  {
    title: 'Milestone 2: Calibration Harness',
    description: 'Bench rig plan, pump assumptions, CSV schema, and repeatable shot list.',
    status: 'Planned',
  },
  {
    title: 'Milestone 3: Lab Calibration',
    description: 'Measured pour data for ingredients and the first usable recipe profiles.',
    status: 'Needs lab access',
  },
  {
    title: 'Milestone 4: Scan First, Drill Last',
    description: 'Object assessment, scanning workflow, art measurement, and filming plan.',
    status: 'Needs horse access',
  },
];

export const openSourceArtifacts: PlaceholderCard[] = [
  {
    title: 'Source Repository',
    description: 'Code, docs, firmware, CAD references, calibration data, and decision records.',
    status: 'Public at launch',
  },
  {
    title: 'Calibration Data',
    description: 'CSV data and scripts treated as first-class project artifacts.',
    status: 'Schema next',
  },
  {
    title: 'Build Files',
    description: 'Nostril Nozzle, sidecar, PCB, and laser/CAD exports when validated.',
    status: 'Do not invent',
  },
  {
    title: 'Safety Notes',
    description: 'Food path, alcohol handling, tool safety, and power notes kept visible.',
    status: 'Always visible',
  },
];

export const pageContent = {
  buildLog: [
    {
      title: 'Decision Timeline',
      description: 'Accepted decisions will be summarized here from the project decision record.',
      status: 'Placeholder',
    },
    {
      title: 'Build Updates',
      description: 'Each milestone will add concise progress notes and review links.',
      status: 'Placeholder',
    },
    {
      title: 'Failure Notes',
      description: 'The delightful and regrettable discoveries that make the engineering real.',
      status: 'Placeholder',
    },
  ],
  calibration: [
    {
      title: 'Pump Bench Rig',
      description: 'Layout, tools, measurement approach, and repeatability checks.',
      status: 'Planned',
    },
    {
      title: 'Recipe Volumes',
      description: 'Explicit ingredient volumes for one-to-three ingredient pours.',
      status: 'Placeholder',
    },
    {
      title: 'Data Downloads',
      description: 'CSV exports, chart snapshots, and calibration provenance.',
      status: 'Awaiting data',
    },
  ],
  media: [
    {
      title: 'Hero Media',
      description: 'Final object photos, first-pour video, and launch page visual assets.',
      status: 'Future capture',
    },
    {
      title: 'Build Process',
      description: 'Photos and clips showing scanning, fabrication, wiring, and calibration.',
      status: 'Future capture',
    },
    {
      title: 'Release Queue',
      description: 'Prepared short-form story beats for the post-launch weekly cadence.',
      status: 'Placeholder',
    },
  ],
};

export const githubLink = {
  href: 'https://github.com/oaktownlabs/thenegronipony',
  label: 'GitHub',
  icon: Github,
};

export const reviewChecklist = [
  'Static React Router v7 app with SSR disabled',
  'Vite build output ready for Cloudflare static assets',
  'Placeholder sections for launch content, docs, media, CAD, firmware, and data',
  'Unknown hardware specs and safety-sensitive details marked for future validation',
];

export const safetyNotes = [
  'Food-path materials are not specified yet.',
  'Alcohol handling and service context remain V1 non-goals.',
  'Power, pump, tubing, and drilling details must be validated before physical work.',
];
