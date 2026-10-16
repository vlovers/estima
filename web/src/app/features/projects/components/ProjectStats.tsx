import { Project } from '../../../types';
import { formatHours, projectEffort } from '../../../utils/estimation';

export function ProjectStats({ project }: { project: Project }) {
  const tasks = project.tasks ?? [];
  const effort = projectEffort(tasks);
  const needsInput = tasks.filter(
    (task) => task.status === 'pending_clarification'
  ).length;
  return (
    <div className="summary-grid">
      <div className="surface summary-card">
        <div className="summary-label">Top-level tasks</div>
        <div className="summary-value">{tasks.length}</div>
        <div className="summary-footnote">
          Breakdowns stay inside their parent task
        </div>
      </div>
      <div className="surface summary-card">
        <div className="summary-label">Estimated effort</div>
        <div className="summary-value">
          {formatHours(effort.hours)}
          {effort.hours !== undefined && (
            <span style={{ fontSize: 14, marginLeft: 6 }}>hours</span>
          )}
        </div>
        <div className="summary-footnote">
          {effort.estimatedTasks
            ? `${effort.estimatedTasks} of ${tasks.length} tasks have estimates`
            : 'No estimates available yet'}
        </div>
      </div>
      <div className="surface summary-card">
        <div className="summary-label">Needs your input</div>
        <div className="summary-value">{needsInput}</div>
        <div className="summary-footnote">Tasks awaiting clarification</div>
      </div>
    </div>
  );
}
