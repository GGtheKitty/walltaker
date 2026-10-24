# The Rails callers keep their existing interface while Node owns query
# construction, upstream requests, caching, and post eligibility checks.
class E621 < LegacyE621
  def get_tag_results(tag_string, after, before, link, limit = 15)
    return super unless NodeE621.enabled?

    NodeE621.request('search', tags: tag_string.to_s, after:, before:, limit:, policy: NodeE621.policy(link))
  rescue NodeE621::Unavailable
    nil
  end

  def get_search_base(link)
    return super unless NodeE621.enabled?

    NodeE621.request('query', tags: '', policy: NodeE621.policy(link)).fetch('suffix')
  rescue NodeE621::Unavailable
    nil
  end

  def get_post(id, link)
    return super unless NodeE621.enabled?

    NodeE621.request('select', post_id: id, policy: NodeE621.policy(link))
  rescue NodeE621::Unavailable
    nil
  end

  def get_media_url(id)
    if NodeE621.enabled?
      NodeE621.request('post', post_id: id).dig('post', 'file', 'url')
    else
      cached = CachedPost.find_by(post_id: id)
      return cached.url if cached

      response = Excon.get("https://e621.net/posts/#{id.to_i}.json", headers: { 'User-Agent': SiteConfig.e621_user_agent })
      return unless response.status == 200

      url = JSON.parse(response.body).dig('post', 'file', 'url')
      CachedPost.create(post_id: id, url:) if url.present?
      url
    end
  rescue NodeE621::Unavailable, JSON::ParserError, Excon::Error
    nil
  end
end
