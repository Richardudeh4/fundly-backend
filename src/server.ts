import { config } from './config';
import app from './app';
import { markOverdueInstalments } from './jobs/markOverdue';

app.listen(config.PORT, () => {
  console.log(`API running on http://localhost:${config.PORT}`);

  // Run the overdue job immediately on startup, then every hour
  markOverdueInstalments();
  setInterval(markOverdueInstalments, 60 * 60 * 1000);
});
