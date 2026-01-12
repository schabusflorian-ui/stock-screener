// frontend/src/components/settings/UserManagementPanel.js
// Admin panel for managing users

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Shield,
  ShieldOff,
  Search,
  Trash2,
  RefreshCw,
  ChevronRight,
  Briefcase,
  FileText,
  Calendar,
  Mail,
  AlertCircle,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './UserManagementPanel.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function UserManagementPanel() {
  const { user: currentUser, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE}/api/admin/users?search=${encodeURIComponent(searchTerm)}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Admin access required');
        }
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.users || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/stats`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  // Fetch user details
  const fetchUserDetails = async (userId) => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedUser(data.user);
      }
    } catch (err) {
      console.error('Failed to fetch user details:', err);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchStats();
    }
  }, [isAdmin, fetchUsers, fetchStats]);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAdmin) fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, isAdmin, fetchUsers]);

  // Grant/revoke admin
  const toggleAdmin = async (userId, currentlyAdmin) => {
    try {
      setActionLoading(userId);
      const endpoint = currentlyAdmin ? 'revoke-admin' : 'grant-admin';
      const response = await fetch(
        `${API_BASE}/api/admin/users/${userId}/${endpoint}`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update admin status');
      }

      // Refresh users
      fetchUsers();
      if (selectedUser?.id === userId) {
        fetchUserDetails(userId);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Delete/deactivate user
  const deleteUser = async (userId, hard = false) => {
    try {
      setActionLoading(userId);
      const response = await fetch(
        `${API_BASE}/api/admin/users/${userId}?hard=${hard}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      fetchUsers();
      fetchStats();
      setSelectedUser(null);
      setConfirmAction(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCurrency = (value) => {
    if (!value) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  if (!isAdmin) {
    return (
      <div className="user-management-panel">
        <div className="admin-access-denied">
          <AlertCircle size={48} />
          <h3>Admin Access Required</h3>
          <p>You need administrator privileges to access this panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-management-panel">
      {/* Stats Cards */}
      {stats && (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="stat-icon users">
              <Users size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.users}</span>
              <span className="stat-label">Total Users</span>
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="stat-icon admins">
              <Shield size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.admins}</span>
              <span className="stat-label">Admins</span>
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="stat-icon portfolios">
              <Briefcase size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.portfolios}</span>
              <span className="stat-label">Portfolios</span>
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="stat-icon value">
              <span className="stat-value">{formatCurrency(stats.totalPortfolioValue)}</span>
              <span className="stat-label">Total Value</span>
            </div>
          </div>
        </div>
      )}

      {/* Search & Actions */}
      <div className="user-list-header">
        <div className="search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="btn-refresh" onClick={fetchUsers} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="admin-error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="user-management-layout">
        {/* User List */}
        <div className="user-list-container">
          <table className="user-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Portfolios</th>
                <th>Admin</th>
                <th>Last Login</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className={`${selectedUser?.id === user.id ? 'selected' : ''} ${
                    user.id === currentUser?.id ? 'current-user' : ''
                  }`}
                  onClick={() => fetchUserDetails(user.id)}
                >
                  <td className="user-cell">
                    {user.picture ? (
                      <img src={user.picture} alt="" className="user-avatar" />
                    ) : (
                      <div className="user-avatar-placeholder">
                        {user.name?.[0] || user.email?.[0] || '?'}
                      </div>
                    )}
                    <div className="user-info">
                      <span className="user-name">{user.name || 'Unnamed'}</span>
                      <span className="user-email">{user.email}</span>
                    </div>
                  </td>
                  <td>{user.portfolio_count || 0}</td>
                  <td>
                    <span className={`admin-badge ${user.is_admin ? 'admin' : ''}`}>
                      {user.is_admin ? <Shield size={14} /> : <ShieldOff size={14} />}
                    </span>
                  </td>
                  <td className="date-cell">{formatDate(user.last_login_at)}</td>
                  <td>
                    <ChevronRight size={16} className="chevron" />
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan="5" className="no-users">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* User Detail Panel */}
        {selectedUser && (
          <div className="user-detail-panel">
            <div className="detail-header">
              {selectedUser.picture ? (
                <img src={selectedUser.picture} alt="" className="detail-avatar" />
              ) : (
                <div className="detail-avatar-placeholder">
                  {selectedUser.name?.[0] || selectedUser.email?.[0] || '?'}
                </div>
              )}
              <div className="detail-info">
                <h3>{selectedUser.name || 'Unnamed User'}</h3>
                <span className="detail-email">
                  <Mail size={14} />
                  {selectedUser.email}
                </span>
              </div>
              <button
                className="btn-close-detail"
                onClick={() => setSelectedUser(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="detail-stats">
              <div className="detail-stat">
                <Briefcase size={16} />
                <span>{selectedUser.stats?.portfolioCount || 0} portfolios</span>
              </div>
              <div className="detail-stat">
                <FileText size={16} />
                <span>{selectedUser.stats?.notesCount || 0} notes</span>
              </div>
              <div className="detail-stat">
                <Calendar size={16} />
                <span>Joined {formatDate(selectedUser.created_at)}</span>
              </div>
            </div>

            {selectedUser.portfolios?.length > 0 && (
              <div className="detail-portfolios">
                <h4>Portfolios</h4>
                <ul>
                  {selectedUser.portfolios.slice(0, 5).map((p) => (
                    <li key={p.id}>
                      <span className="portfolio-name">{p.name}</span>
                      <span className="portfolio-value">
                        {formatCurrency(p.current_value)}
                      </span>
                    </li>
                  ))}
                  {selectedUser.portfolios.length > 5 && (
                    <li className="more-portfolios">
                      +{selectedUser.portfolios.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="detail-actions">
              <button
                className={`btn-action ${selectedUser.is_admin ? 'revoke' : 'grant'}`}
                onClick={() => toggleAdmin(selectedUser.id, selectedUser.is_admin)}
                disabled={
                  actionLoading === selectedUser.id ||
                  selectedUser.id === currentUser?.id
                }
              >
                {selectedUser.is_admin ? (
                  <>
                    <ShieldOff size={16} />
                    Revoke Admin
                  </>
                ) : (
                  <>
                    <Shield size={16} />
                    Make Admin
                  </>
                )}
              </button>

              {selectedUser.id !== currentUser?.id && (
                <button
                  className="btn-action delete"
                  onClick={() =>
                    setConfirmAction({ type: 'delete', user: selectedUser })
                  }
                  disabled={actionLoading === selectedUser.id}
                >
                  <Trash2 size={16} />
                  Deactivate
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="confirm-modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Deactivation</h3>
            <p>
              Are you sure you want to deactivate{' '}
              <strong>{confirmAction.user.email}</strong>?
            </p>
            <p className="confirm-warning">
              This will archive all their portfolios and remove admin access.
            </p>
            <div className="confirm-actions">
              <button
                className="btn-cancel"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
              <button
                className="btn-confirm"
                onClick={() => deleteUser(confirmAction.user.id, false)}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagementPanel;
