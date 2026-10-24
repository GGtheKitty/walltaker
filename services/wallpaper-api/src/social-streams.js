// A signed Turbo name proves authenticity, not current thread membership.
// Membership IDs change on rejoining, keeping a removed member's sockets idle.
export function createSocialStreamAuthorizer(pool) {
  return async (stream,viewerId) => {
    const member=/^social_thread_member_(\d+)_(\d+)$/.exec(stream);
    if(member) {
      if(String(viewerId)!==member[2])return false;
      return (await pool.query(`SELECT p.id FROM message_thread_participants p JOIN users u ON u.id=p.user_id
        WHERE p.id=$1 AND p.user_id=$2 AND u.deleted_at IS NULL`,[member[1],viewerId])).rowCount>0;
    }
    const notification=/^header_notifications_(\d+)$/.exec(stream);
    if(notification)return String(viewerId)===notification[1];
    const decoded=stream.startsWith('gid://') ? stream : Buffer.from(stream,'base64url').toString('utf8');
    // Existing thread-wide streams no longer carry private messages.
    if(/\/MessageThread\/\d+$/.test(decoded))return false;
    const surrender=/\/Surrender\/(\d+)$/.exec(decoded);
    if(surrender)return viewerId!=null && (await pool.query('SELECT id FROM surrenders WHERE id=$1 AND (user_id=$2 OR controller_user_id=$2)',[surrender[1],viewerId])).rowCount>0;
    return true;
  };
}
