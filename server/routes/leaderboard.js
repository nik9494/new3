import express from 'express';

export default function leaderboardRoutes(pool) {
  const router = express.Router();

  // Get leaderboard data
  router.get('/', async (req, res) => {
    try {
      const { period = 'day', limit = 10, offset = 0 } = req.query;

      let timeFilter;
      switch (period) {
        case 'day':
          timeFilter = "AND g.end_time > NOW() - INTERVAL '1 day'";
          break;
        case 'week':
          timeFilter = "AND g.end_time > NOW() - INTERVAL '7 days'";
          break;
        case 'month':
          timeFilter = "AND g.end_time > NOW() - INTERVAL '30 days'";
          break;
        case 'all':
        default:
          timeFilter = '';
          break;
      }

      const query = `
        SELECT 
          u.id,
          u.username,
          u.telegram_id,
          COUNT(DISTINCT g.id) as games_won,
          COALESCE(SUM(t.amount), 0) as stars_won
        FROM 
          users u
        JOIN 
          games g ON u.id = g.winner_id
        LEFT JOIN 
          transactions t ON t.user_id = u.id AND t.type = 'payout'
        WHERE 
          g.winner_id IS NOT NULL
          ${timeFilter}
        GROUP BY 
          u.id, u.username, u.telegram_id
        ORDER BY 
          stars_won DESC, games_won DESC
        LIMIT $1 OFFSET $2
      `;

      const result = await pool.query(query, [limit, offset]);

      // Add rank to each entry
      const leaderboard = result.rows.map((entry, index) => ({
        ...entry,
        rank: parseInt(offset) + index + 1,
      }));

      res.json(leaderboard);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Get user's rank in leaderboard
  router.get('/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const { period = 'day' } = req.query;

      let timeFilter;
      switch (period) {
        case 'day':
          timeFilter = "AND g.end_time > NOW() - INTERVAL '1 day'";
          break;
        case 'week':
          timeFilter = "AND g.end_time > NOW() - INTERVAL '7 days'";
          break;
        case 'month':
          timeFilter = "AND g.end_time > NOW() - INTERVAL '30 days'";
          break;
        case 'all':
        default:
          timeFilter = '';
          break;
      }

      // First get the user's stats
      const userStatsQuery = `
        SELECT 
          u.id,
          u.username,
          COUNT(DISTINCT g.id) as games_won,
          COALESCE(SUM(t.amount), 0) as stars_won
        FROM 
          users u
        LEFT JOIN 
          games g ON u.id = g.winner_id
        LEFT JOIN 
          transactions t ON t.user_id = u.id AND t.type = 'payout'
        WHERE 
          u.id = $1
          ${timeFilter}
        GROUP BY 
          u.id, u.username
      `;

      const userStatsResult = await pool.query(userStatsQuery, [userId]);

      if (userStatsResult.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const userStats = userStatsResult.rows[0];

      // Then get the user's rank
      const rankQuery = `
        SELECT COUNT(*) + 1 as rank
        FROM (
          SELECT 
            u.id,
            COALESCE(SUM(t.amount), 0) as stars_won,
            COUNT(DISTINCT g.id) as games_won
          FROM 
            users u
          JOIN 
            games g ON u.id = g.winner_id
          LEFT JOIN 
            transactions t ON t.user_id = u.id AND t.type = 'payout'
          WHERE 
            g.winner_id IS NOT NULL
            ${timeFilter}
          GROUP BY 
            u.id
          HAVING 
            COALESCE(SUM(t.amount), 0) > $1
            OR (COALESCE(SUM(t.amount), 0) = $1 AND COUNT(DISTINCT g.id) > $2)
        ) as higher_ranked
      `;

      const rankResult = await pool.query(rankQuery, [
        userStats.stars_won,
        userStats.games_won,
      ]);

      const rank = parseInt(rankResult.rows[0].rank);

      res.json({
        ...userStats,
        rank,
      });
    } catch (error) {
      console.error('Error fetching user rank:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  return router;
}
