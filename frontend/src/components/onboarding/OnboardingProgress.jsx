// components/onboarding/OnboardingProgress.jsx
import { useOnboardingProgress, ONBOARDING_TASKS } from '../../hooks/useOnboardingProgress';
import { CheckCircle, Circle, X } from '../icons';
import './OnboardingProgress.css';

export const OnboardingProgress = () => {
  const { completedTasks, dismissOnboarding, isVisible, progress, allComplete } = useOnboardingProgress();

  if (!isVisible) return null;

  return (
    <div className="onboarding-progress-widget">
      <div className="onboarding-progress-header">
        <h3 className="onboarding-progress-title">Getting Started</h3>
        <button
          onClick={dismissOnboarding}
          className="onboarding-progress-dismiss"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="onboarding-progress-bar-container">
        <div className="onboarding-progress-bar">
          <div
            className="onboarding-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="onboarding-progress-text">
          {completedTasks.length} of {ONBOARDING_TASKS.length} complete
        </span>
      </div>

      {/* Tasks */}
      <div className="onboarding-tasks">
        {ONBOARDING_TASKS.map((task) => {
          const isComplete = completedTasks.includes(task.id);

          return (
            <a
              key={task.id}
              href={task.link}
              className={`onboarding-task ${isComplete ? 'complete' : ''}`}
            >
              {isComplete ? (
                <CheckCircle className="onboarding-task-icon complete" size={18} />
              ) : (
                <Circle className="onboarding-task-icon" size={18} />
              )}
              <span className="onboarding-task-label">{task.label}</span>
            </a>
          );
        })}
      </div>

      {allComplete && (
        <div className="onboarding-complete-message">
          <span className="celebration-emoji">🎉</span>
          <p>You're all set! Great job exploring the platform.</p>
        </div>
      )}
    </div>
  );
};
