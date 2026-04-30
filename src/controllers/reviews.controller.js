const { ReviewService } = require("../services/review.service");

class ReviewsController {
  constructor() {
    this.reviewService = new ReviewService();
  }

  list = async (req, res) => {
    const reviews = await this.reviewService.list(req.query.status);
    return res.json(reviews);
  };

  getById = async (req, res) => {
    const review = await this.reviewService.getById(Number(req.params.id));
    if (!review) {
      return res.status(404).json({ error: "Solicitacao de revisao nao encontrada." });
    }

    return res.json(review);
  };

  approve = async (req, res) => {
    const result = await this.reviewService.approve(Number(req.params.id), req.body?.reviewed_by);
    return res.json(result);
  };

  reject = async (req, res) => {
    const result = await this.reviewService.reject(Number(req.params.id), req.body?.reviewed_by);
    return res.json(result);
  };
}

module.exports = { ReviewsController };
