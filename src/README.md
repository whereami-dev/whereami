# Source Code Structure

This directory contains the modular components that were extracted from the original monolithic `server.js` file.

## Directory Structure

```
src/
├── config/          # Configuration modules
│   ├── database.js  # Database connection and configuration
│   └── nunjucks.js  # Nunjucks template engine configuration
├── middleware/      # Express middleware
│   └── auth.js      # Authentication middleware
├── routes/          # Express route handlers
│   ├── auth.js      # Authentication routes (login, register, logout)
│   ├── matchmaking.js # Matchmaking routes (lobby, queue, status)
│   └── index.js     # Central router module
├── services/        # Business logic services
│   ├── backgroundTasks.js  # Background tasks for duel management
│   ├── eloRating.js        # ELO rating system calculations
│   ├── locationGenerator.js # Street View location generation
│   └── matchmaking.js      # Matchmaking logic
├── socket/          # Socket.io handlers
│   └── handlers.js  # WebSocket connection and event handlers
└── utils/           # Utility functions
    └── helpers.js   # Helper functions (distance, score, UUID, etc.)
```

## Modules Overview

### Configuration (`config/`)
- **database.js**: Manages MySQL database connections and provides helper functions for database operations
- **nunjucks.js**: Configures the Nunjucks template engine with custom filters

### Middleware (`middleware/`)
- **auth.js**: Provides authentication middleware to protect routes

### Routes (`routes/`)
- **auth.js**: Handles user authentication (login, registration, logout)
- **matchmaking.js**: Manages lobby, queue, and matchmaking status
- **index.js**: Central module that can be used to organize all routes

### Services (`services/`)
- **backgroundTasks.js**: Manages background tasks like auto-starting games, handling timeouts, and updating duel states
- **eloRating.js**: Implements the ELO rating system for competitive matchmaking
- **locationGenerator.js**: Generates valid Street View locations with country balancing
- **matchmaking.js**: Handles the matchmaking queue and duel creation logic

### Socket (`socket/`)
- **handlers.js**: Manages WebSocket connections, user sessions, and real-time duel updates

### Utils (`utils/`)
- **helpers.js**: Contains utility functions for distance calculation, score calculation, rating colors, and UUID generation

## Benefits of This Structure

1. **Maintainability**: Code is organized by functionality, making it easier to find and modify specific features
2. **Readability**: Each module has a clear, single responsibility
3. **Testability**: Isolated modules are easier to unit test
4. **Scalability**: New features can be added as new modules without cluttering existing code
5. **Reusability**: Modules can be reused across different parts of the application

## File Size Reduction

- **Original server.js**: 2,143 lines (74KB)
- **Refactored server.js**: 598 lines (21KB)
- **Reduction**: 72% smaller main file

The complexity has been distributed across well-organized modules, making the codebase much more manageable.
