import { useRoute, Redirect } from 'wouter';

export default function ProjectDetail() {
  const [, params] = useRoute('/projects/:id');
  const projectId = params?.id;

  // Redirect to overview by default
  if (projectId) {
    return <Redirect to={`/projects/${projectId}/overview`} />;
  }

  return <Redirect to="/projects" />;
}