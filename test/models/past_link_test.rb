require "test_helper"

class PastLinkTest < ActiveSupport::TestCase
  self.fixture_table_names = []

  test "video previews use the stored image thumbnail" do
    past_link = PastLink.new(
      post_url: "https://static.example/video.mp4",
      post_thumbnail_url: "https://static.example/video-thumbnail.jpg"
    )

    assert_equal "https://static.example/video-thumbnail.jpg", past_link.preview_image_url
  end

  test "video detection supports webm URLs with query strings" do
    past_link = PastLink.new(
      post_url: "https://static.example/video.WEBM?download=1",
      post_thumbnail_url: "https://static.example/video-thumbnail.jpg"
    )

    assert_equal "https://static.example/video-thumbnail.jpg", past_link.preview_image_url
  end

  test "image previews continue to use the original image" do
    past_link = PastLink.new(
      post_url: "https://static.example/image.png",
      post_thumbnail_url: "https://static.example/image-thumbnail.jpg"
    )

    assert_equal "https://static.example/image.png", past_link.preview_image_url
  end

  test "video previews are omitted when no thumbnail was stored" do
    past_link = PastLink.new(post_url: "https://static.example/video.mp4")

    assert_nil past_link.preview_image_url
  end

  test "e621 page URL uses the stored post ID" do
    past_link = PastLink.new(e621_post_id: 123_456, post_url: "https://static.example/video.mp4")

    assert_equal "https://e621.net/posts/123456", past_link.e621_page_url
  end

  test "older history uses its e621 file MD5 as a page lookup" do
    past_link = PastLink.new(post_url: "https://static1.e621.net/data/ab/cd/0123456789abcdef0123456789abcdef.webm")

    assert_equal "https://e621.net/posts?md5=0123456789abcdef0123456789abcdef", past_link.e621_page_url
  end

  test "link history retains the exact e621 post ID" do
    link = Link.new(
      e621_post_id: 123_456,
      post_url: "https://static.example/video.mp4",
      post_thumbnail_url: "https://static.example/video-thumbnail.jpg"
    )

    assert_equal 123_456, PastLink.log_link(link, '').e621_post_id
  end
end
