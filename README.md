# Backend API Structure

This backend has been restructured into modular files with JWT-based user authentication for better maintainability and security.

## File Structure

```
mo-re-DB/
├── index.js              # Main server file (entry point)
├── config/
│   └── database.js       # Database configuration and initialization
├── routes/
│   ├── auth.js           # Authentication routes (register, login, profile)
│   ├── customers.js      # Customer CRUD routes (authenticated)
│   ├── projects.js       # Project CRUD routes (authenticated)
│   └── tasks.js          # Task CRUD routes (authenticated)
├── middleware/
│   └── auth.js           # JWT authentication middleware
├── utils/
│   └── auth.js           # Authentication utilities (JWT, password hashing)
├── data.db              # SQLite database file
├── package.json         # Dependencies and scripts
├── .env.example         # Environment variables template
└── README.md            # This file
```

## Authentication System

### Database Schema
- **users**: User accounts with email, password (hashed), firstName, lastName
- **customers**: Linked to users via `userId` foreign key
- **projects**: Linked to users via `userId` foreign key
- **tasks**: Linked to users via `userId` foreign key

### Security Features
- Password hashing with bcryptjs (12 salt rounds)
- JWT tokens for authentication
- Protected routes with middleware
- User-specific data isolation
- Input validation and error handling

## API Endpoints

### Authentication Routes (`/api/auth`)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get current user profile (requires auth)
- `PUT /api/auth/profile` - Update user profile (requires auth)
- `PUT /api/auth/change-password` - Change password (requires auth)

### Customer Routes (`/api/customers`) - **All require authentication**
- `GET /api/customers` - List user's customers (with optional projects)
- `POST /api/customers` - Create new customer
- `PUT /api/customers/:customerId` - Update customer
- `DELETE /api/customers/:customerId` - Delete customer (cascades to projects/tasks)

### Project Routes (`/api/customers/:customerId/projects`) - **All require authentication**
- `GET /api/customers/:customerId/projects` - List projects for customer (with optional tasks)
- `POST /api/customers/:customerId/projects` - Create new project
- `PUT /api/customers/:customerId/projects/:projectId` - Update project
- `DELETE /api/customers/:customerId/projects/:projectId` - Delete project

### Task Routes (`/api/customers/:customerId/projects/:projectId/tasks`) - **All require authentication**
- `GET /api/customers/:customerId/projects/:projectId/tasks` - List tasks for project
- `POST /api/customers/:customerId/projects/:projectId/tasks` - Create new task
- `PUT /api/customers/:customerId/projects/:projectId/tasks/:taskId` - Update task
- `DELETE /api/customers/:customerId/projects/:projectId/tasks/:taskId` - Delete task

## Authentication Usage

### Registration
```json
POST /api/auth/register
{
  "email": "",
  "password": "",
  "firstName": "John",
  "lastName": "Doe"
}
```

### Login
```json
POST /api/auth/login
{
  "email": "",
  "password": ""
}
```

### Using Protected Endpoints
Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Environment Setup

1. Copy `.env.example` to `.env`
2. Update the JWT_SECRET with a secure random string
3. Configure other settings as needed

## Data Isolation

Each user can only access their own data:
- Users can only see/modify their own customers, projects, and tasks
- All database queries include user ID filtering
- Unauthorized access attempts return 404 or 401 errors

## Usage

Start the server with:
```bash
npm start
```

The API will be available at `http://localhost:3001` (or the port specified in `PORT` environment variable).

**Note**: Existing data without user associations will not be accessible after authentication is enabled. You may need to migrate existing data or start fresh.
