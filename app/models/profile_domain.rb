class ProfileDomain < ApplicationRecord
  enum :status, { pending: 0, approved: 1, blocked: 2 }

  belongs_to :reviewed_by, class_name: 'User', optional: true

  validates :domain, presence: true, uniqueness: { case_sensitive: false }

  before_validation :normalize_domain

  def self.decision_for(hostname)
    hostname = ProfileDomainFilter.normalize_hostname(hostname)
    return if hostname.blank?

    labels = hostname.split('.')
    candidates = ProfileDomainFilter.ip_address?(hostname) ? [hostname] : labels.each_index.map { |index| labels[index..].join('.') }
    decisions = where(domain: candidates).where.not(status: statuses[:pending]).index_by(&:domain)
    candidates.filter_map { |candidate| decisions[candidate] }.first
  end

  private

  def normalize_domain
    self.domain = ProfileDomainFilter.normalize_hostname(domain)
  end
end
