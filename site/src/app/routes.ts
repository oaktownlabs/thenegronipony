import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('build-log', 'routes/build-log.tsx'),
  route('calibration', 'routes/calibration.tsx'),
  route('open-source', 'routes/open-source.tsx'),
  route('media', 'routes/media.tsx'),
] satisfies RouteConfig;
